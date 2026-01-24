using Kanban.Entities;
using Kanban.Models;
using Kanban.Services;
using Mailjet.Client.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Kanban.Controllers
{
    [Authorize]
    public class KanbanController : Controller
    {
        private readonly IKanbanService _kanbanService;
        public KanbanController(IKanbanService kanbanService)
        {
            _kanbanService = kanbanService;
        }

        [HttpGet]
        public async Task<IActionResult> GetBoard(long boardId)
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetBoard(userId, boardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<BoardColumnResultModel>>.Ok(r.Data.Select(x => new BoardColumnResultModel
            {
                Id = x.Id,
                Title = x.Title,
                Cards = x.BoardCards.Select(c => new BoardCardResultModel
                {
                    Id = c.Id,
                    Desc = c.Desc,
                    Order = c.OrderNo,
                    DueDate = c.DueDate,
                    WarningDays = c.WarningDays,
                    HighlightColor = c.HighlightColor ?? "",
                    AssigneeAvatar = c.AssigneeUser != null ? c.AssigneeUser.Avatar : "",
                    AssigneeName = c.AssigneeUser != null ? c.AssigneeUser.FullName : "",
                    AssigneeId = c.AssigneeUser != null ? c.AssigneeUser.Id : 0
                }).OrderBy(y => y.Order).ToList()
            }).ToList()));
        }

        [HttpGet]
        public async Task<IActionResult> GetBoardMembers(long boardId)
        {
            var r = await _kanbanService.GetBoardMembers(User.GetUserId(), boardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<BoardMemberResultModel>>.Ok(r.Data));
        }

        [HttpPost]
        public async Task<IActionResult> UpdateCard([FromBody] BoardCardUpdateModel model)
        {
            var r = await _kanbanService.UpdateCard(User.GetUserId(), model.BoardId, model.CardId, model.Description,
                model.DueDate, model.WarningDays, model.HighlightColor, model.AssigneeId);

            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> DeleteMember([FromBody] BoardMemberInputModel model)
        {
            var r = await _kanbanService.DeleteMember(User.GetUserId(), model.BoardId, model.UserId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPut]
        public async Task<IActionResult> PromoteToOwner(long boardId, long userId)
        {
            var r = await _kanbanService.PromoteToOwner(User.GetUserId(), boardId, userId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpGet]
        public async Task<IActionResult> CheckBoardVersion(long boardId)
        {
            var r = await _kanbanService.GetBoardVersion(User.GetUserId(), boardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<BoardRefresResultModel>.Ok(r.Data));
        }

        [HttpGet]
        public async Task<IActionResult> GetBoards()
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetBoards(userId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<BoardResultModel>>.Ok(r.Data.Select(x => new BoardResultModel
            {
                Id = x.Board.Id,
                Title = x.Board.Title,
                IsOwner = x.IsOwner
            }).OrderByDescending(x => x.Id).ToList()));
        }

        [HttpPost]
        public async Task<IActionResult> CreateBoard([FromBody] BoardInputModel model)
        {
            var r = await _kanbanService.CreateBoard(User.GetUserId(), model.Title);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpDelete]
        public async Task<IActionResult> DeleteBoard(long boardId)
        {
            var r = await _kanbanService.DeleteBoard(User.GetUserId(), boardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> AddColumn([FromBody] BoardColumnInputModel model)
        {
            var r = await _kanbanService.AddColumn(User.GetUserId(), model.BoardId, model.Title);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpDelete]
        public async Task<IActionResult> DeleteColumn(long boardId, long columnId)
        {
            var r = await _kanbanService.DeleteColumn(User.GetUserId(), boardId, columnId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> AddCard([FromBody] BoardCardInsertModel model)
        {
            var r = await _kanbanService.AddCard(User.GetUserId(), model.BoardId, model.ColumnId, model.Description,
                model.DueDate, model.WarningDays, model.HighlightColor, model.AssigneeId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpDelete]
        public async Task<IActionResult> DeleteCard(long boardId, long cardId)
        {
            var r = await _kanbanService.DeleteCard(User.GetUserId(), boardId, cardId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> MoveCard([FromBody] BoardCardMoveInputModel model)
        {
            var r = await _kanbanService.MoveCard(User.GetUserId(), model.BoardId, model.CardId, model.NewColumnId, model.NewOrder);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> InviteUserToBoard([FromBody] BoardUserInputModel model)
        {
            var r = await _kanbanService.InviteUserToBoard(User.GetUserId(), User.GetFullName(), User.GetEmail(), model.BoardId, model.Email);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }
    }
}
