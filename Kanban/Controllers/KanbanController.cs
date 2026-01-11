using Kanban.Entities;
using Kanban.Models;
using Kanban.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

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
        public async Task<IActionResult> GetBoard(int boardId)
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetBoardColumns_Cards(userId, boardId);
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
                    Desc = c.Desc
                }).ToList()
            }).ToList()));
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
                Id = x.Id,
                Title = x.Title,
                IsOwner = x.UserId == userId
            }).ToList()));
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
    }
}
